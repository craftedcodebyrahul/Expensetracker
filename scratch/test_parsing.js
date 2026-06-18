import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
console.log('Using API key:', apiKey);

const sentence = 'Paid rent of $1200 on 1st June';
const today = '2026-06-18';
const catList = `- food: Food & Dining (expense)
- transport: Transportation (expense)
- housing: Housing & Rent (expense)
- utilities: Utilities (expense)
- healthcare: Healthcare (expense)
- entertainment: Entertainment (expense)
- shopping: Shopping (expense)
- education: Education (expense)
- travel: Travel (expense)
- subscriptions: Subscriptions (expense)
- insurance: Insurance (expense)`;

const prompt = `You are a financial parser for a personal finance application.
Parse the following natural language sentence describing a financial transaction.
Today is ${today}.

SENTENCE: "${sentence}"

CATEGORIES AVAILABLE:
${catList}

Extract:
1. amount: number (absolute value, e.g. 2500 for $2500)
2. type: 'income', 'expense', or 'transfer'. Words like 'received', 'salary', 'refund', 'earn', 'gift from' suggest income. Words like 'paid', 'spent', 'bought', 'bought for', 'lost' suggest expense. Words like 'transfer to', 'moved to' suggest transfer.
3. description: a clean merchant name or description (e.g. 'Walmart', 'salary', 'landlord', 'transfer between accounts').
4. date: YYYY-MM-DD. Calculate the date relative to today's date (${today}) if the user says 'today', 'yesterday', 'last monday', etc. If no date is mentioned, use today's date (${today}).
5. categoryId: map the transaction to the most appropriate category ID from the list above. If unsure, set to null.

You MUST return a JSON object with this exact structure:
{
  "amount": number | null,
  "type": "income" | "expense" | "transfer",
  "description": string | null,
  "date": "YYYY-MM-DD" | null,
  "categoryId": string | null
}
Return ONLY valid JSON. No Markdown formatting, no code block backticks, no other text.`;

async function testParse() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 2000 },
      })
    });
    const json = await res.json();
    console.log('Returned JSON:', JSON.stringify(json, null, 2));
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    console.log('Returned Text:', text);
    try {
      const parsed = JSON.parse(text);
      console.log('Successfully Parsed JSON:', parsed);
    } catch (e) {
      console.error('JSON Parse Error:', e);
    }
  } catch (err) {
    console.error('Fetch Error:', err);
  }
}

testParse();
