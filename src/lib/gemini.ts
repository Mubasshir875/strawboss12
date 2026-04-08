import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function generateItemDescription(title: string, category: string, listingType: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Generate a detailed, engaging, and elite description for a high-fashion item.
      
      Item Title: ${title}
      Category: ${category}
      Listing Type: ${listingType === 'auction' ? 'Public Auction' : 'Private Treaty'}
      
      The description should be sophisticated, highlighting the design, craftsmanship, material quality, and brand heritage. Use an elite, minimalist, and archival tone suitable for a high-end fashion marketplace like "Strawboss Fashion Marketplace". Keep it around 100-150 words.`,
    });

    return response.text;
  } catch (error) {
    console.error("Error generating description:", error);
    throw new Error("Failed to generate description with AI.");
  }
}
