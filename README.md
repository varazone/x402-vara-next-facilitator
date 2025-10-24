# x402-vara-next-facilitator

## Getting Started

First, run the development server:

```bash
bun dev
```

Then you can add the url to `.env` in other services that rely on a x402-vara facilitator for local development purposes.

```
FACILITATOR_URL=http://localhost:3000/api/facilitator
```

Or you can add the `app/api/facilitator/*` files to your own project so you don't need to run it separately.

Example: [varazone/x402-vara-next-demo](https://github.com/varazone/x402-vara-next-demo)

## API Routes

This service contains the following API routes:

- /api/facilitator/verify
- /api/facilitator/settle

API type references: [x402-protocol-types.ts](https://github.com/gear-foundation/x402-vara/blob/main/src/lib/x402-protocol-types.ts)
