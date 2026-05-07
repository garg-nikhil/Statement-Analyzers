/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type } from "@google/genai";
import { ExtractionResult, TransactionType } from "../types";

const VENDORS = ['H&M', 'Zara', 'Amazon', 'Flipkart', 'Myntra', 'Ajio', 'Nykaa', 'Meesho', 'Tata CLiQ', 'Reliance Trends', 'Max Fashion', 'Pantaloons'];

let aiClient: GoogleGenAI | null = null;

function getAIClient() {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
      throw new Error("Gemini API key is not configured. To fix this, click on 'Settings' (gear icon) in the bottom-left of AI Studio, go to 'Secrets', and add 'GEMINI_API_KEY' with your API key.");
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    transactions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          date: { type: Type.STRING, description: "Format: DD/MM/YYYY or similar" },
          description: { type: Type.STRING },
          amount: { type: Type.NUMBER },
          type: { type: Type.STRING, enum: Object.values(TransactionType) },
          vendor: { type: Type.STRING, description: "The vendor name (Best match from: Amazon, H&M, Zara, Flipkart, Myntra, Ajio, Nykaa, Meesho, etc. or just 'Other Marketplace')" },
          isRecurring: { type: Type.BOOLEAN, description: "Whether this transaction seems recurring (subsidies, monthly bills, etc.)" }
        },
        required: ["date", "description", "amount", "type", "vendor"]
      }
    }
  },
  required: ["transactions"]
};

export async function extractTransactions(base64Image: string, mimeType: string): Promise<ExtractionResult> {
  const ai = getAIClient();
  const prompt = `
    You are an expert financial auditor specializing in marketplace and fashion spending analysis.
    Analyze this credit card statement image and extract ALL transactions related to marketplace and fashion vendors.
    
    Target Vendors include but are not limited to:
    ${VENDORS.join(', ')}.

    Important Instructions:
    1. Identify transactions that match these vendors or any other similar marketplace/fashion retailers.
    2. If a vendor is clearly a marketplace but not in the list, label it accurately or use 'Other Marketplace'.
    3. Segregate the amount into Debit (Spending/Purchase) or Credit (Refund/Payment/Cashback).
    4. Return 'DEBIT' if it's a purchase and 'CREDIT' if it's a refund or credit.
    5. Ensure the amounts are positive numbers.
    6. Identify if the transaction looks recurring (e.g., monthly subscriptions, fixed bills).
  `;

  console.log("Starting Gemini extraction with model: gemini-flash-latest");

  try {
    const textPart = { text: prompt };
    const imagePart = {
      inlineData: {
        data: base64Image.split(',')[1] || base64Image,
        mimeType: mimeType
      }
    };

    const response = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: { parts: [textPart, imagePart] },
      config: {
        responseMimeType: "application/json",
        responseSchema: responseSchema
      }
    });

    console.log("Gemini response received:", response.text);

    if (!response.text) {
      throw new Error("Empty response from Gemini");
    }

    const result = JSON.parse(response.text);
    const transactions = result.transactions || [];

    // Calculate summaries
    const summariesMap: Record<string, any> = {};
    VENDORS.forEach(v => {
      summariesMap[v] = {
        vendor: v,
        debits: [],
        credits: [],
        totalDebit: 0,
        totalCredit: 0
      };
    });

    transactions.forEach((tx: any) => {
      const v = VENDORS.find(vendor => tx.vendor.toLowerCase().includes(vendor.toLowerCase())) || tx.vendor;
      if (summariesMap[v]) {
        if (tx.type === TransactionType.DEBIT) {
          summariesMap[v].debits.push(tx);
          summariesMap[v].totalDebit += tx.amount;
        } else {
          summariesMap[v].credits.push(tx);
          summariesMap[v].totalCredit += tx.amount;
        }
      }
    });

    const vendorSummaries = Object.values(summariesMap).filter(s => s.debits.length > 0 || s.credits.length > 0);

    return {
      transactions,
      vendorSummaries
    };
  } catch (error) {
    console.error("Gemini Extraction Error:", error);
    throw error;
  }
}
