# Rule: Vite Env
- Client env vars must be prefixed with VITE_
- Access client env via import.meta.env
- Never reference server-only keys in client code
- Add/extend src/vite-env.d.ts when introducing new VITE_ vars
