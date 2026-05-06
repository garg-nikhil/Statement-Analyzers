/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type } from "@google/genai";
import { ExtractionResult, TransactionType } from "../types";

const VENDORS = ['H&M', 'Zara', 'Amazon', 'Flipkart', 'Myntra', 'Ajio', 'Nykaa', 'Meesho', 'Tata CLiQ', 'Reliance Trends', 'Max Fashion', 'Pantaloons'];

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
          vendor: { type: Type.STRING, description: "The vendor name (Best match from: Amazon, H&M, Zara, Flipkart, Myntra, Ajio, Nykaa, Meesho, etc. or just 'Other Marketplace')" }
        },
        required: ["date", "description", "amount", "type", "vendor"]
      }
    }
  },
  required: ["transactions"]
};

export async function extractTransactions(base64Image: string, mimeType: string): Promise<ExtractionResult> {
  const prompt = `
    You are an expert financial auditor. 
    Analyze this credit card statement image and extract ALL transactions related to marketplace and fashion vendors.
    
    Target Vendors include but are not limited to:
    ${VENDORS.join(', ')}.

    Important Instructions:
    1. Identify transactions that match these vendors or any other similar marketplace/fashion retailers.
    2. If a vendor is clearly a marketplace but not in the list, label it accurately or use 'Other Marketplace'.
    3. Segregate the amount into Debit (Spending/Purchase) or Credit (Refund/Payment/Cashback).
    4. Look for indicators in the statement: 
       - Debit: Often marked with 'D', 'Dr', 'dr', or 'Debit'.
       - Credit: Often marked with 'C', 'Cr', 'cr', or 'Credit'.
    5. Return 'DEBIT' if it's a purchase and 'CREDIT' if it's a refund or credit.
    6. Ensure the amounts are positive numbers.
  `;

  console.log("Starting Gemini extraction with model: gemini-3-flash-preview");

  try {
    const textPart = { text: prompt };
    const imagePart = {
      inlineData: {
        data: base64Image.split(',')[1] || base64Image,
        mimeType: mimeType
      }
    };

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
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
