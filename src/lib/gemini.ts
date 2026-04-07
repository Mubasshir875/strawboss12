import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function generateArtifactDescription(title: string, category: string, listingType: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Generate a detailed, engaging, and elite description for an auction item.
      
      Artifact Title: ${title}
      Category: ${category}
      Listing Type: ${listingType === 'auction' ? 'Public Auction' : 'Private Treaty'}
      
      The description should be sophisticated, highlighting the historical significance, craftsmanship, and rarity. Use an elite, archival tone suitable for a high-end antiquities marketplace like "Strawboss Archives". Keep it around 150-200 words.`,
    });

    return response.text;
  } catch (error) {
    console.error("Error generating description:", error);
    throw new Error("Failed to generate description with AI.");
  }
}
