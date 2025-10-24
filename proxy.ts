import { NextRequest, NextResponse } from 'next/server';
import { paymentMiddleware } from "x402-vara/next";

// Configure protected routes and their payment requirements
export const proxy = paymentMiddleware(
  process.env.PAYMENT_RECIPIENT_ADDRESS!,
  {
    "/api/protected/weather": [
      {
        price: "1000000000000",
        network: "vara-testnet",
        config: {
          description: "Access to weather data API (pay in native token)",
        },
      },
      {
        price: "1000000",
        // asset: "0x974a0e2071d9bfa5de65b307b2b3df5a1d6559b02171dbec5decfbc3bdd24773",
        asset: "0x64f9def5a6da5a2a847812d615151a88f8c508e062654885267339a8bf29e52f",
        network: "vara-testnet",
        config: {
          description: "Access to weather data API (pay in VFT token)",
          extra: {
            name: "WUSDC",
            decimals: 6,
          },
        },
      },
    ],
  },
  {
    // Facilitator URL is REQUIRED for x402 protocol
    url: process.env.FACILITATOR_URL!,
  },
);

export const config = {
  matcher: ['/api/protected/:path*'],
};
