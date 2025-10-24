import { NextRequest, NextResponse } from "next/server";
import type {
  SettleRequest,
  SettleResponse,
  PaymentPayload,
} from "x402-vara/lib";
import { X402_VERSION, X402_SCHEME, validVaraNetworks } from "x402-vara/lib";
import { useApi } from "x402-vara/utils";
import { settleWithApi } from "x402-vara/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/facilitator/settle
 * 
 * x402 Facilitator Settle Endpoint (per official spec):
 * - Receives payment header and payment requirements from protected API AFTER verification
 * - Submits transaction to blockchain
 * - Waits for confirmation
 * - Returns settlement result (success, txHash, networkId)
 * 
 * This is slow and expensive - actual blockchain submission
 * Only call this AFTER the work/resource has been verified
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`[Facilitator Verify] POST ${request.nextUrl.pathname}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  try {
    const body: SettleRequest = await request.json();
    const { x402Version, paymentHeader, paymentRequirements } = body;

    console.log(`[Facilitator Settle] Request body:`, {
      x402Version,
      hasPaymentHeader: !!paymentHeader,
      headerLength: paymentHeader?.length,
      scheme: paymentRequirements.scheme,
      network: paymentRequirements.network,
    });

    // Validate x402 version
    if (x402Version !== X402_VERSION) {
      console.error(`[Facilitator Settle] ❌ Unsupported x402 version: ${x402Version}`);
      const response: SettleResponse = {
        success: false,
        error: `Unsupported x402 version: ${x402Version}`,
        txHash: null,
        networkId: null,
      };
      return NextResponse.json(response);
    }

    // Validate required fields
    if (!paymentHeader || !paymentRequirements) {
      console.error(`[Facilitator Settle] ❌ Missing required fields`);
      const response: SettleResponse = {
        success: false,
        error: "Missing paymentHeader or paymentRequirements",
        txHash: null,
        networkId: null,
      };
      return NextResponse.json(response, { status: 400 });
    }

    // Validate scheme
    if (paymentRequirements.scheme !== X402_SCHEME) {
      console.error(`[Facilitator Settle] ❌ Unsupported scheme: ${paymentRequirements.scheme}`);
      const response: SettleResponse = {
        success: false,
        error: `Unsupported scheme: ${paymentRequirements.scheme}`,
        txHash: null,
        networkId: null,
      };
      return NextResponse.json(response);
    }

    // Validate network is Vara-specific
    const network = paymentRequirements.network;
    if (!network || !validVaraNetworks.includes(network)) {
      console.error(`[Facilitator Settle] ❌ Invalid Vara network: ${network}`);
      const response: SettleResponse = {
        success: false,
        error: `Invalid Vara network: ${network}. Expected one of ${validVaraNetworks}`,
        txHash: null,
        networkId: null,
      };
      return NextResponse.json(response);
    }
    
    console.log(`[Facilitator Settle] Network: ${network}`);

    const api = await useApi(network);
    console.log(`[Facilitator Settle] ✅ Vara api initialized`);

    // Parse the payment header (base64 encoded PaymentPayload)
    console.log(`[Facilitator Settle] 📥 Raw paymentHeader (first 100 chars):`, paymentHeader.substring(0, 100) + '...');
    console.log(`[Facilitator Settle] 📥 Raw paymentHeader length:`, paymentHeader.length);
    
    let paymentPayloadJson: string;
    try {
      paymentPayloadJson = Buffer.from(paymentHeader, 'base64').toString('utf-8');
      console.log(`[Facilitator Settle] 📝 Decoded JSON (first 300 chars):`, paymentPayloadJson.substring(0, 300) + '...');
    } catch (decodeError) {
      console.error(`[Facilitator Settle] ❌ Failed to decode base64 header:`, decodeError);
      const response: SettleResponse = {
        success: false,
        error: `Invalid Vara network: ${network}. Expected one of ${validVaraNetworks}`,
        txHash: null,
        networkId: null,
      };
      return NextResponse.json(response);
    }
    
    let paymentPayload: PaymentPayload;
    try {
      paymentPayload = JSON.parse(paymentPayloadJson);
      console.log(`[Facilitator Settle] ✅ Parsed JSON successfully`);
    } catch (parseError) {
      console.error(`[Facilitator Verify] ❌ Failed to parse JSON:`, parseError);
      const response: SettleResponse = {
        success: false,
        error: "Invalid JSON in payment payload",
        txHash: null,
        networkId: null,
      };
      return NextResponse.json(response);
    }
    
    console.log(`[Facilitator Settle] Parsed payment payload:`, {
      x402Version: paymentPayload.x402Version,
      scheme: paymentPayload.scheme,
      network: paymentPayload.network,
      hasPayload: !!paymentPayload.payload,
      payloadType: typeof paymentPayload.payload,
      payloadKeys: paymentPayload.payload ? Object.keys(paymentPayload.payload) : [],
    });

    // Validate payment payload matches requirements
    if (paymentPayload.scheme !== paymentRequirements.scheme) {
      const response: SettleResponse = {
        success: false,
        error: `Scheme mismatch: expected ${paymentRequirements.scheme}, got ${paymentPayload.scheme}`,
        txHash: null,
        networkId: null,
      };
      return NextResponse.json(response);
    }

    if (paymentPayload.network !== paymentRequirements.network) {
      const response: SettleResponse = {
        success: false,
        error: `Network mismatch: expected ${paymentRequirements.network}, got ${paymentPayload.network}`,
        txHash: null,
        networkId: null,
      };
      return NextResponse.json(response);
    }

    const signature = paymentPayload.payload.signature;
    const transaction = paymentPayload.payload.transaction;
    
    // For Vara scheme, the payload contains signature and transaction separately
    console.log(`\n🔍 [Facilitator Settle] Extracting signature and transaction...`);
    console.log(`[Facilitator Settle] payload.signature exists:`, !!signature);
    console.log(`[Facilitator Settle] payload.transaction exists:`, !!transaction);
    
    if (!signature || !transaction) {
      console.error(`[Facilitator Settle] ❌ Missing signature or transaction`);
      console.error(`[Facilitator Settle] Signature:`, signature ? 'present' : 'MISSING');
      console.error(`[Facilitator Settle] Transaction:`, transaction ? 'present' : 'MISSING');
      const response: SettleResponse = {
        success: false,
        error: "Invalid payload: missing signature or transaction",
        txHash: null,
        networkId: null,
      };
      return NextResponse.json(response);
    }

    // TODO:
    // - verify tx amount matches maxRequiredAmount
    // - verify tx recipient matches payTo

    // settle tx
    const settleOptions = {
      waitForFinalization: false,
    };
    const result = await settleWithApi(api)(paymentPayload, settleOptions);

    if (!result.success) {
      console.error(`[Facilitator Settle] ❌ Submit transaction failed:`, result.message);
      console.error(`[Facilitator Settle] ❌ api.isConnected:`, api.isConnected);
      const response: SettleResponse = {
	success: false,
	error: result.message,
        txHash: null,
        networkId: null,
      };
      return NextResponse.json(response);
    }

    console.log(`\n✅ [Facilitator Settle] Payment payload is settled!`);

    let pendingTx = {hash: result.txHash};

    console.log(`\n✅ [Facilitator Settle] Payment settled successfully!`);
    console.log(`[Facilitator Settle] Transaction hash: ${pendingTx.hash}`);

    const duration = Date.now() - startTime;
    console.log(`[Facilitator Settle] ⏱️  Settlement took ${duration}ms`);

    const settleResponse: SettleResponse = {
      success: true,
      error: null,
      txHash: pendingTx.hash,
      networkId: network,
    };

    console.log(`[Facilitator Settle] Response:`, settleResponse);
    const nextResponse = NextResponse.json(settleResponse);
    nextResponse.headers.set('X-Settlement-Time', duration.toString());
    return nextResponse;

  } catch (error: any) {
    console.error(`\n❌ [Facilitator Settle] ERROR during settlement`);
    console.error(`[Facilitator Settle] Error type:`, error.constructor.name);
    console.error(`[Facilitator Settle] Error message:`, error.message);
    console.error(`[Facilitator Settle] Full error:`, error);
    
    // Check if it's a duplicate transaction error
    if (error.message?.includes("SEQUENCE_NUMBER_TOO_OLD") || 
        error.message?.includes("INVALID_SEQ_NUMBER") ||
        error.message?.includes("already submitted")) {
      const response: SettleResponse = {
        success: false,
        error: "Transaction already used",
        txHash: null,
        networkId: null,
      };
      return NextResponse.json(response, { status: 409 });
    }

    const response: SettleResponse = {
      success: false,
      error: error.message || String(error),
      txHash: null,
      networkId: null,
    };
    
    return NextResponse.json(response, { status: 500 });
  }
}
