# Frontend Performance Optimization Checklist

## High Priority

- Keep your page weight **< 1500 KB** (ideally **< 500 KB**)
- Keep page load time **< 3 seconds**
- Enable **GZIP or Brotli compression**
- Minimize **HTTP requests**
- Compress images and reduce the number of images
- Set proper **HTTP cache headers**
- Keep **Time To First Byte (TTFB) < 1.3 seconds**
- Avoid **blocking JavaScript** (use `async` or `defer`)
- Minify JavaScript
- Minify CSS (remove comments and whitespace)
- Inline **critical CSS** (above-the-fold styles)
- Ensure CSS files are **non-blocking**
- Use **HTTP/2**
- Choose the correct **image format**
- Avoid requesting **missing files (404 errors)**
- Serve files from the **same protocol**
- Minimize the use of **iframes**
- Avoid embedded or excessive **inline CSS**
- Review and simplify **stylesheets complexity**

---

## Medium Priority

- Minify HTML (remove comments and whitespace)
- Use a **Content Delivery Network (CDN)**
- Prefer **vector images (SVG)** over bitmap images when possible
- Define explicit **width and height attributes** for images
- Avoid using **Base64 images**
- Lazy load **offscreen images**
- Serve images close to the **display size**
- Avoid multiple **inline JavaScript snippets**
- Keep dependencies **up to date**
- Monitor **JavaScript performance issues**
- Use **Service Workers** for caching or heavy tasks
- Keep **cookie size < 4096 bytes**
- Keep **cookie count < 20**

---

## Low Priority

- Preload URLs when possible
- Concatenate CSS into fewer files
- Remove unused CSS
- Use **WOFF2 font format**
- Use **preconnect** for faster font loading
- Keep **web font size < 300 KB**
- Prevent **Flash of Invisible Text (FOIT)**
- Monitor the **size of dependencies**

---

## Performance Tools

Use these tools to measure and diagnose frontend performance:

- **PageSpeed Insights**
- **Lighthouse**
- **WebPageTest**
- **Chrome DevTools**
- **Bundlephobia**
- **Squoosh.app**

---