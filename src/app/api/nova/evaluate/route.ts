import { NextResponse } from "next/server";
import { NovaEngine } from "@/lib/services/nova-core";

export async function POST(request: Request) {
  try {
    // 1. Parse incoming JSON body
    const body = await request.json();
    const { entityType, entityId } = body;

    // 2. Validate payload
    if (!entityType || !entityId) {
      return NextResponse.json(
        { error: "Missing required fields: 'entityType' and 'entityId'." },
        { status: 400 }
      );
    }

    // 3. Route to specific intelligence engine based on type
    if (entityType === "PRODUCT") {
      const evaluationResult = await NovaEngine.evaluateProduct(entityId);
      
      return NextResponse.json({
        success: true,
        message: "Product evaluation completed successfully.",
        data: evaluationResult,
      }, { status: 200 });
    }

    // Extensible for future SUPPPLIER or MARKET evaluations
    return NextResponse.json(
      { error: `Entity type '${entityType}' is not currently supported.` },
      { status: 400 }
    );

  } catch (error: any) {
    console.error("[NOVA_AI_ERROR]:", error.message);
    
    return NextResponse.json(
      { 
        success: false, 
        error: "Internal Server Error during NOVA AI evaluation.",
        details: error.message 
      },
      { status: 500 }
    );
  }
}