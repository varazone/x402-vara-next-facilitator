import { NextRequest, NextResponse } from "next/server";
import type {
  VerifyRequest,
  VerifyResponse,
  PaymentPayload,
} from "x402-vara/lib";
import { X402_VERSION, X402_SCHEME, validVaraNetworks } from "x402-vara/lib";
import { useApi, balanceOf } from "x402-vara/utils";
import { verifyWithApi } from "x402-vara/server";
import { hexToU8a, u8aToHex } from '@polkadot/util'
import { decodeAddress } from '@polkadot/util-crypto'

export const dynamic = "force-dynamic";

/**
 * POST /api/facilitator/verify
 * 
 * x402 Facilitator Verify Endpoint (per official spec):
 * - Receives payment header and payment requirements from protected API
 * - Verifies the transaction structure and signature
 * - Checks amount and recipient WITHOUT submitting to blockchain
 * - Returns verification result (isValid/invalidReason)
 * 
 * This is fast and cheap - just validation, no blockchain submission
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`[Facilitator Verify] POST ${request.nextUrl.pathname}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  try {
    const body: VerifyRequest = await request.json();
    const { x402Version, paymentHeader, paymentRequirements } = body;

    console.log(`[Facilitator Verify] Request body:`, {
      x402Version,
      hasPaymentHeader: !!paymentHeader,
      headerLength: paymentHeader?.length,
      scheme: paymentRequirements.scheme,
      network: paymentRequirements.network,
      maxAmountRequired: paymentRequirements.maxAmountRequired,
      payTo: paymentRequirements.payTo,
      asset: paymentRequirements.asset,
    });

    // Validate x402 version
    if (x402Version !== X402_VERSION) {
      console.error(`[Facilitator Verify] ❌ Unsupported x402 version: ${x402Version}`);
      const response: VerifyResponse = {
        isValid: false,
        invalidReason: `Unsupported x402 version: ${x402Version}`,
      };
      return NextResponse.json(response);
    }

    // Validate required fields
    if (!paymentHeader || !paymentRequirements) {
      console.error(`[Facilitator Verify] ❌ Missing required fields`);
      const response: VerifyResponse = {
        isValid: false,
        invalidReason: "Missing paymentHeader or paymentRequirements",
      };
      return NextResponse.json(response, { status: 400 });
    }

    // Validate scheme
    if (paymentRequirements.scheme !== X402_SCHEME) {
      console.error(`[Facilitator Verify] ❌ Unsupported scheme: ${paymentRequirements.scheme}`);
      const response: VerifyResponse = {
        isValid: false,
        invalidReason: `Unsupported scheme: ${paymentRequirements.scheme}`,
      };
      return NextResponse.json(response);
    }

    // Validate network is Vara-specific
    const network = paymentRequirements.network;
    if (!network || !validVaraNetworks.includes(network)) {
      console.error(`[Facilitator Verify] ❌ Invalid Vara network: ${network}`);
      const response: VerifyResponse = {
        isValid: false,
        invalidReason: `Invalid Vara network: ${network}. Expected one of ${validVaraNetworks}`,
      };
      return NextResponse.json(response);
    }
    
    console.log(`[Facilitator Verify] Network: ${network}`);
    
    const api = await useApi(network);
    console.log(`[Facilitator Verify] ✅ Vara api initialized`);

    // Parse the payment header (base64 encoded PaymentPayload)
    console.log(`[Facilitator Verify] 📥 Raw paymentHeader (first 100 chars):`, paymentHeader.substring(0, 100) + '...');
    console.log(`[Facilitator Verify] 📥 Raw paymentHeader length:`, paymentHeader.length);
    
    let paymentPayloadJson: string;
    try {
      paymentPayloadJson = Buffer.from(paymentHeader, 'base64').toString('utf-8');
      console.log(`[Facilitator Verify] 📝 Decoded JSON (first 300 chars):`, paymentPayloadJson.substring(0, 300) + '...');
    } catch (decodeError) {
      console.error(`[Facilitator Verify] ❌ Failed to decode base64 header:`, decodeError);
      const response: VerifyResponse = {
        isValid: false,
        invalidReason: "Invalid base64 encoding in X-PAYMENT header",
      };
      return NextResponse.json(response);
    }
    
    let paymentPayload: PaymentPayload;
    try {
      paymentPayload = JSON.parse(paymentPayloadJson);
      console.log(`[Facilitator Verify] ✅ Parsed JSON successfully`);
    } catch (parseError) {
      console.error(`[Facilitator Verify] ❌ Failed to parse JSON:`, parseError);
      const response: VerifyResponse = {
        isValid: false,
        invalidReason: "Invalid JSON in payment payload",
      };
      return NextResponse.json(response);
    }
    
    console.log(`[Facilitator Verify] Parsed payment payload:`, {
      x402Version: paymentPayload.x402Version,
      scheme: paymentPayload.scheme,
      asset: paymentPayload.asset,
      network: paymentPayload.network,
      hasPayload: !!paymentPayload.payload,
      payloadType: typeof paymentPayload.payload,
      payloadKeys: paymentPayload.payload ? Object.keys(paymentPayload.payload) : [],
    });

    // Validate payment payload matches requirements
    if (paymentPayload.scheme !== paymentRequirements.scheme) {
      const response: VerifyResponse = {
        isValid: false,
        invalidReason: `Scheme mismatch: expected ${paymentRequirements.scheme}, got ${paymentPayload.scheme}`,
      };
      return NextResponse.json(response);
    }

    if (paymentPayload.network !== paymentRequirements.network) {
      const response: VerifyResponse = {
        isValid: false,
        invalidReason: `Network mismatch: expected ${paymentRequirements.network}, got ${paymentPayload.network}`,
      };
      return NextResponse.json(response);
    }

    if (paymentPayload.asset !== paymentRequirements.asset) {
      const response: VerifyResponse = {
        isValid: false,
        invalidReason: `Asset mismatch: expected ${paymentRequirements.asset}, got ${paymentPayload.asset}`,
      };
      return NextResponse.json(response);
    }

    const amount = BigInt(paymentRequirements.maxAmountRequired);
    const balance = await balanceOf(api, paymentPayload.payload.transaction.address, paymentPayload.asset);

    if (balance < amount) {
      const response: VerifyResponse = {
	isValid: false,
	invalidReason: `Insufficient asset balance: expected ${amount}, got ${balance}`,
      };
      return NextResponse.json(response);
    }

    console.log(`\n🔍 [Facilitator Verify] Checking asset balance...`);
    console.log(`[Facilitator Verify] Sufficient asset balance:`, balance);

    const signature = paymentPayload.payload.signature;
    const transaction = paymentPayload.payload.transaction;
    
    // For Vara scheme, the payload contains signature and transaction separately
    console.log(`\n🔍 [Facilitator Verify] Extracting signature and transaction...`);
    console.log(`[Facilitator Verify] payload.signature exists:`, !!signature);
    console.log(`[Facilitator Verify] payload.transaction exists:`, !!transaction);
    
    if (!signature || !transaction) {
      console.error(`[Facilitator Verify] ❌ Missing signature or transaction`);
      console.error(`[Facilitator Verify] Signature:`, signature ? 'present' : 'MISSING');
      console.error(`[Facilitator Verify] Transaction:`, transaction ? 'present' : 'MISSING');
      const response: VerifyResponse = {
        isValid: false,
        invalidReason: "Invalid payload: missing signature or transaction",
      };
      return NextResponse.json(response);
    }

    // TODO:
    // - verify tx amount matches maxRequiredAmount
    // - verify tx recipient matches payTo

    // verify tx signature
    const result = await verifyWithApi(api)(paymentPayload);

    if (!result.isValid) {
      console.error(`[Facilitator Verify] ❌ Signature verification failed:`, result.invalidReason);
      console.error(`[Facilitator Verify] ❌ api.isConnected:`, api.isConnected);
      const response: VerifyResponse = {
	isValid: false,
	invalidReason: result.invalidReason,
      };
      return NextResponse.json(response);
    }

    console.log(`\n✅ [Facilitator Verify] Payment payload is valid!`);

    const duration = Date.now() - startTime;
    console.log(`[Facilitator Verify] ⏱️  Verification took ${duration}ms`);

    const response: VerifyResponse = {
      isValid: true,
      invalidReason: null,
    };

    console.log(`[Facilitator Verify] Response:`, response);
    const nextResponse = NextResponse.json(response);
    nextResponse.headers.set('X-Verification-Time', duration.toString());
    return nextResponse;

  } catch (error: any) {
    console.error("[Facilitator Verify] Error verifying payment:", error);
    
    const response: VerifyResponse = {
      isValid: false,
      invalidReason: error.message || String(error),
    };
    
    return NextResponse.json(response, { status: 500 });
  }
}
